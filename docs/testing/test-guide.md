# 测试编写与运行指南

## 测试命令速查

### Python 后端测试

```bash
# 在项目根目录执行

# 运行全部测试
pytest tests/

# 运行全部测试（unittest 方式）
python -m unittest discover -s tests -v

# 运行单个测试模块
pytest tests/test_integration.py
pytest tests/test_character_factory.py
pytest tests/test_task_routes.py

# 运行单个测试模块（unittest 方式）
python -m unittest tests.test_task_routes -v
python -m unittest tests.test_pipeline_routes -v

# 带覆盖率
pytest --cov=. --cov-report=term-missing tests/
```

### 前端 E2E 测试（Playwright）

```bash
# 在 Next.js 前端目录执行
cd "oii前端/oiioii-clone/"

# 运行全部 E2E 测试
npx playwright test

# 运行浏览器级功能检查（Node.js 脚本）
node tests/functional_test.mjs
```

### 前端构建检查

```bash
# 在 Next.js 前端目录执行
cd "oii前端/oiioii-clone/"

# TypeScript 编译 + 构建验证（作为正确性门控）
npm run build
```

> `npm run build` 是当前主要的前端正确性检验手段，没有配置专门的 linter 或 formatter。

---

## 测试文件命名约定

### Python 后端

- 测试文件放在 `tests/` 目录下
- 文件名格式：`test_*.py`（例如 `test_task_routes.py`、`test_character_factory.py`）
- 测试类名：`Test*`（例如 `TestTaskRoutes`）
- 测试方法名：`test_*`（例如 `test_invalid_task_id_returns_404`）

### 前端 E2E

- 测试文件放在 `tests/` 目录下
- 浏览器功能测试使用 `.mjs` 扩展名（例如 `functional_test.mjs`）
- Playwright 测试遵循 Playwright 默认命名约定

### React 组件/页面

- 遵循 Next.js 约定：`src/app/**/page.tsx`
- 组件文件使用 PascalCase

---

## 如何新增测试用例

### 新增 Python 后端测试

1. 在 `tests/` 目录下创建文件，命名为 `test_<模块名>.py`
2. 导入被测模块和 `unittest` 或 `pytest`
3. 编写测试类/函数：

```python
import pytest

class TestMyFeature:
    """我的功能测试"""

    def test_normal_case(self):
        """正常场景"""
        result = my_function("valid_input")
        assert result["status"] == "ok"

    def test_edge_case(self):
        """边界场景"""
        with pytest.raises(ValueError):
            my_function("")
```

4. 运行验证：`pytest tests/test_my_feature.py -v`

### 新增前端 E2E 测试

1. 确保后端和前端都在运行
2. 在 `tests/` 目录下创建 `.mjs` 文件
3. 使用浏览器 API 或 Playwright 编写测试逻辑
4. 运行：`node tests/my_test.mjs` 或 `npx playwright test`

### 新增联通测试用例

1. 参照 `docs/functional-test-plan.md` 中的用例模板
2. 用例编号延续现有序列（TC-13, TC-14...）
3. 标注优先级（P0/P1/P2）和前置依赖
4. 包含：步骤、验证点表格、失败排查

---

## 测试分类

| 标签 | 说明 | 命令示例 |
|------|------|----------|
| 单元测试 | 后端模块级测试 | `pytest tests/test_character_factory.py` |
| 集成测试 | API 路由级测试 | `pytest tests/test_integration.py` |
| 回归测试 | Bug 修复验证 | `pytest tests/test_task_routes.py` |
| E2E 测试 | 浏览器端到端 | `npx playwright test` |
| 构建测试 | TypeScript + 构建 | `npm run build` |

---

## 注意事项

1. **运行后端测试前**确保 MySQL 可用，否则部分集成测试可能跳过或失败
2. **E2E 测试需要**后端和前端同时运行
3. **路径含中文字符**：前端目录 `oii前端/` 在 shell 中必须加引号
4. **Windows 环境**：使用 `npm.cmd` 而非 `npm` 来后台启动前端
5. **无专门的 formatter/linter**：以 `npm run build` 和单测作为主要正确性门控
