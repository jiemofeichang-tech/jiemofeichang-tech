"""
Agent implementation — the core while loop with tool use.
Switched to native Anthropic SDK (/v1/messages) for tool_use support.
The proxy at peiqian.icu supports /v1/messages but not /v1/chat/completions with tools.
"""
from __future__ import annotations

import json
import time
import logging
import anthropic

import config
import tools
import context

log = logging.getLogger("harness")

# ---------------------------------------------------------------------------
# LLM client (singleton) — Anthropic SDK
# ---------------------------------------------------------------------------

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        # Anthropic SDK appends /v1/messages to base_url automatically.
        # If BASE_URL already ends with /v1, strip it to avoid /v1/v1/messages.
        base = config.BASE_URL.rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3]  # strip trailing /v1
        _client = anthropic.Anthropic(
            api_key=config.API_KEY,
            base_url=base,
            timeout=300.0,
            max_retries=2,
        )
    return _client


def _openai_tools_to_anthropic(openai_schemas: list[dict]) -> list[dict]:
    """Convert OpenAI function-calling schema to Anthropic tool schema."""
    result = []
    for s in openai_schemas:
        fn = s.get("function", s)
        result.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
        })
    return result


def _messages_openai_to_anthropic(messages: list[dict]) -> tuple[str | None, list[dict]]:
    """
    Split OpenAI-format messages into (system_prompt, messages).
    Also convert tool call/result format.

    Note: the proxy at peiqian.icu does NOT support the top-level `system`
    parameter.  Callers must inject the system text into the first user
    message instead (see _inject_system_into_messages).
    """
    system = None
    converted = []
    for m in messages:
        role = m["role"]
        if role == "system":
            system = m["content"] if isinstance(m["content"], str) else str(m["content"])
            continue
        if role == "assistant":
            content = []
            text = m.get("content") or ""
            if text:
                content.append({"type": "text", "text": text})
            for tc in m.get("tool_calls", []):
                try:
                    inp = json.loads(tc["function"]["arguments"])
                except (json.JSONDecodeError, KeyError):
                    inp = {}
                content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["function"]["name"],
                    "input": inp,
                })
            converted.append({"role": "assistant", "content": content or [{"type": "text", "text": ""}]})
        elif role == "tool":
            converted.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": m["tool_call_id"],
                    "content": m["content"],
                }],
            })
        else:
            converted.append({"role": role, "content": m["content"]})
    return system, converted


def _inject_system_into_messages(system: str | None, messages: list[dict]) -> list[dict]:
    """
    Prepend the system prompt text to the first user message so we don't need
    the top-level `system` parameter (which this proxy does not support).
    """
    if not system or not messages:
        return messages
    result = list(messages)
    first = result[0]
    if first["role"] == "user":
        if isinstance(first["content"], str):
            result[0] = {
                "role": "user",
                "content": f"[SYSTEM INSTRUCTIONS]\n{system}\n[/SYSTEM INSTRUCTIONS]\n\n{first['content']}",
            }
        elif isinstance(first["content"], list):
            # content block list — prepend a text block
            new_blocks = [{"type": "text", "text": f"[SYSTEM INSTRUCTIONS]\n{system}\n[/SYSTEM INSTRUCTIONS]\n\n"}]
            result[0] = {"role": "user", "content": new_blocks + first["content"]}
    return result


def llm_call_simple(messages: list[dict]) -> str:
    """Simple LLM call without tools — used for summarization."""
    system, converted = _messages_openai_to_anthropic(messages)
    # Inject system into first user message (proxy doesn't support top-level system)
    converted = _inject_system_into_messages(system, converted)
    kwargs = dict(
        model=config.MODEL,
        messages=converted,
        max_tokens=8000,  # proxy hard-limits: >20k requires streaming
    )
    resp = get_client().messages.create(**kwargs)
    for block in resp.content:
        if hasattr(block, "text"):
            return block.text
    return ""


# ---------------------------------------------------------------------------
# Core agent loop
# ---------------------------------------------------------------------------

class Agent:
    """
    A single agent with a system prompt and tool access.

    This is the 'managed agent loop' from the architecture:
    - while loop with llm.call(prompt)
    - tool execution
    - context lifecycle (compaction / reset)

    Skills are handled via progressive disclosure:
    - Level 1: skill catalog (name + description) is baked into system_prompt
    - Level 2: agent decides to read_skill_file("skills/.../SKILL.md") on its own
    - Level 3: SKILL.md references sub-files, agent reads those too
    No external code decides which skills to load — the agent does.
    """

    def __init__(self, name: str, system_prompt: str, use_tools: bool = True,
                 extra_tool_schemas: list[dict] | None = None):
        self.name = name
        self.system_prompt = system_prompt
        self.use_tools = use_tools
        self.extra_tool_schemas = extra_tool_schemas or []

    def run(self, task: str) -> str:
        """
        Execute the agent loop until the model stops calling tools
        or we hit the iteration limit.

        Returns the final assistant text response.
        """
        # Keep messages in OpenAI format internally for context management compatibility
        messages: list[dict] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": task},
        ]

        client = get_client()
        consecutive_errors = 0
        last_text = ""

        for iteration in range(1, config.MAX_AGENT_ITERATIONS + 1):
            # --- Context lifecycle check ---
            token_count = context.count_tokens(messages)
            log.info(f"[{self.name}] iteration={iteration}  tokens≈{token_count}")

            if token_count > config.RESET_THRESHOLD or context.detect_anxiety(messages):
                reason = "anxiety detected" if token_count <= config.RESET_THRESHOLD else f"tokens {token_count} > threshold"
                log.warning(f"[{self.name}] Context reset triggered ({reason}). Writing checkpoint...")
                checkpoint = context.create_checkpoint(messages, llm_call_simple)
                messages = context.restore_from_checkpoint(checkpoint, self.system_prompt)
            elif token_count > config.COMPRESS_THRESHOLD:
                log.info(f"[{self.name}] Compacting context (role={self.name})...")
                messages = context.compact_messages(messages, llm_call_simple, role=self.name)

            # --- Convert messages to Anthropic format ---
            system_prompt, anthropic_messages = _messages_openai_to_anthropic(messages)
            # Inject system into first user message (proxy doesn't support top-level system)
            anthropic_messages = _inject_system_into_messages(system_prompt, anthropic_messages)

            # --- Build API kwargs ---
            kwargs: dict = dict(
                model=config.MODEL,
                messages=anthropic_messages,
                max_tokens=16000,  # proxy hard-limits: >20k requires streaming
            )
            if self.use_tools:
                all_schemas = tools.TOOL_SCHEMAS + self.extra_tool_schemas
                kwargs["tools"] = _openai_tools_to_anthropic(all_schemas)

            try:
                response = client.messages.create(**kwargs)
            except Exception as e:
                log.error(f"[{self.name}] API error: {e}")
                consecutive_errors += 1
                if consecutive_errors >= config.MAX_TOOL_ERRORS:
                    log.error(f"[{self.name}] Too many API errors, aborting.")
                    break
                time.sleep(2 ** consecutive_errors)
                continue

            consecutive_errors = 0

            # --- Parse Anthropic response ---
            text_parts = []
            tool_use_blocks = []
            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    tool_use_blocks.append(block)

            assistant_text = "".join(text_parts)
            if assistant_text:
                last_text = assistant_text
                log.info(f"[{self.name}] assistant: {assistant_text[:200]}...")

            # --- Append assistant message in OpenAI format (for context mgmt) ---
            assistant_msg: dict = {"role": "assistant", "content": assistant_text}
            if tool_use_blocks:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tb.id,
                        "type": "function",
                        "function": {
                            "name": tb.name,
                            "arguments": json.dumps(tb.input),
                        },
                    }
                    for tb in tool_use_blocks
                ]
            messages.append(assistant_msg)

            # --- If no tool calls, we're done ---
            if not tool_use_blocks:
                log.info(f"[{self.name}] Finished (no more tool calls).")
                break

            # --- Execute tool calls ---
            for tb in tool_use_blocks:
                fn_name = tb.name
                fn_args = tb.input if isinstance(tb.input, dict) else {}
                log.info(f"[{self.name}] tool: {fn_name}({_truncate(str(fn_args), 120)})")
                result = tools.execute_tool(fn_name, fn_args)
                log.debug(f"[{self.name}] tool result: {_truncate(result, 200)}")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tb.id,
                    "content": result,
                })

            # --- Check stop reason ---
            if response.stop_reason == "end_turn":
                log.info(f"[{self.name}] Finished (end_turn).")
                break

            if response.stop_reason == "max_tokens":
                log.warning(f"[{self.name}] Output truncated (max_tokens hit). Asking model to retry with smaller chunks.")
                messages.append({
                    "role": "user",
                    "content": (
                        "[SYSTEM] Your last response was cut off because it exceeded the token limit. "
                        "The tool call was NOT executed. "
                        "Please retry, but split large files into smaller parts:\n"
                        "1. Write the first half of the file with write_file\n"
                        "2. Then write the second half as a separate file or append\n"
                        "Or simplify the implementation to fit in one response."
                    ),
                })

        else:
            log.warning(f"[{self.name}] Hit max iterations ({config.MAX_AGENT_ITERATIONS}).")

        return last_text


def _truncate(s: str, n: int) -> str:
    return s[:n] + "..." if len(s) > n else s
