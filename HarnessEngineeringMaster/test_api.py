#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API connection test script
"""
import os
import sys
from pathlib import Path

# Add current directory to path
sys.path.append(str(Path(__file__).parent))

# Import config
import config
from openai import OpenAI

def test_api_connection():
    """Test API connection"""
    print("=" * 50)
    print("API Connection Test")
    print("=" * 50)

    # Show config info
    print(f"API Key: {config.API_KEY[:20]}...")
    print(f"Base URL: {config.BASE_URL}")
    print(f"Model: {config.MODEL}")
    print("-" * 50)

    try:
        # Create OpenAI client
        client = OpenAI(
            api_key=config.API_KEY,
            base_url=config.BASE_URL
        )

        print("Testing API connection...")

        # Send test request
        response = client.chat.completions.create(
            model=config.MODEL,
            messages=[
                {"role": "user", "content": "Hello! Please respond with exactly: 'API connection successful'"}
            ],
            max_tokens=50,
            temperature=0
        )

        # Check response
        if response.choices and response.choices[0].message:
            content = response.choices[0].message.content
            print("SUCCESS: API response received!")
            print(f"Response: {content}")

            # Show usage stats
            if hasattr(response, 'usage') and response.usage:
                print(f"Token usage:")
                print(f"   Input tokens: {response.usage.prompt_tokens}")
                print(f"   Output tokens: {response.usage.completion_tokens}")
                print(f"   Total tokens: {response.usage.total_tokens}")

            print("CONNECTION TEST PASSED!")
            return True
        else:
            print("ERROR: API response format abnormal")
            return False

    except Exception as e:
        print(f"ERROR: API connection failed: {str(e)}")

        # Try common error solutions
        if "group_platform_mismatch" in str(e).lower():
            print("\nPossible solutions:")
            print("1. This API key may be for a different platform")
            print("2. Try different models: gpt-3.5-turbo, gpt-4, claude-3-sonnet")
            print("3. Check if the proxy service supports your model")
        elif "404" in str(e):
            print("\nPossible solutions:")
            print("1. Check if Base URL is correct, may need to remove or add /v1")
            print("2. Confirm proxy service supports OpenAI API format")
        elif "401" in str(e) or "403" in str(e):
            print("\nPossible solutions:")
            print("1. Check if API Key is correct")
            print("2. Confirm API Key is valid and not expired")
        elif "timeout" in str(e).lower():
            print("\nPossible solutions:")
            print("1. Check network connection")
            print("2. Proxy service may be slow, try again later")

        return False

def test_different_models():
    """Test different models"""
    print("\n" + "=" * 50)
    print("Testing different models")
    print("=" * 50)

    models_to_try = [
        "gpt-3.5-turbo",
        "gpt-4",
        "gpt-4o",
        "gpt-4-turbo",
        "claude-3-sonnet-20240229",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307"
    ]

    for model in models_to_try:
        print(f"\nTesting model: {model}")

        try:
            client = OpenAI(
                api_key=config.API_KEY,
                base_url=config.BASE_URL
            )

            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "Test"}],
                max_tokens=10,
                temperature=0
            )

            print(f"SUCCESS: {model} works!")
            return model

        except Exception as e:
            print(f"FAILED: {model} - {str(e)[:100]}...")

    return None

def test_different_urls():
    """Test different URL formats"""
    print("\n" + "=" * 50)
    print("Testing different URL formats")
    print("=" * 50)

    urls_to_try = [
        "http://peiqian.icu/v1",
        "http://peiqian.icu",
        "https://peiqian.icu/v1",
        "https://peiqian.icu",
    ]

    for url in urls_to_try:
        print(f"\nTesting URL: {url}")

        try:
            client = OpenAI(
                api_key=config.API_KEY,
                base_url=url
            )

            response = client.chat.completions.create(
                model="gpt-3.5-turbo",  # Use a more common model
                messages=[{"role": "user", "content": "Test"}],
                max_tokens=10,
                temperature=0
            )

            print(f"SUCCESS: {url} works!")
            return url

        except Exception as e:
            print(f"FAILED: {url} - {str(e)[:100]}...")

    return None

if __name__ == "__main__":
    # Basic connection test
    success = test_api_connection()

    # If failed, try different models
    if not success:
        working_model = test_different_models()
        if working_model:
            print(f"\nFound working model: {working_model}")
            print("Please update HARNESS_MODEL in .env file")

    # If still failed, try different URLs
    if not success:
        working_url = test_different_urls()
        if working_url:
            print(f"\nFound working URL: {working_url}")
            print("Please update OPENAI_BASE_URL in .env file")

    print("\n" + "=" * 50)
    if success:
        print("Ready to use Harness!")
        print("Example: python harness.py \"Build a simple calculator\"")
    else:
        print("Please check configuration and test again")
    print("=" * 50)