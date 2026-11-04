import json
import os
import re
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()


class LLMError(RuntimeError):
    pass


class LLMNotConfiguredError(LLMError):
    pass


class LLMResponseError(LLMError):
    pass


class VisionNotConfiguredError(LLMError):
    pass


def _api_key() -> str:
    return (
        os.getenv("LLM_API_KEY")
        or os.getenv("DEEPSEEK_API_KEY")
        or os.getenv("MOONSHOT_API_KEY")
        or ""
    ).strip()


def _base_url() -> str:
    return os.getenv("LLM_BASE_URL", "https://api.moonshot.cn/v1").rstrip("/")


def _model() -> str:
    return os.getenv("LLM_MODEL", "kimi-k3.1-pro")


def _timeout() -> float:
    try:
        return float(os.getenv("LLM_TIMEOUT", "60"))
    except ValueError:
        return 60.0


def _json_mode() -> bool:
    value = os.getenv("LLM_JSON_MODE", "true").strip().lower()
    return value not in {"0", "false", "no"}


def vision_model() -> str:
    return os.getenv("VISION_LLM_MODEL", "").strip()


def vision_base_url() -> str:
    return (os.getenv("VISION_LLM_BASE_URL") or _base_url()).rstrip("/")


def vision_api_key() -> str:
    return (os.getenv("VISION_LLM_API_KEY") or _api_key()).strip()


def vision_configured() -> bool:
    return bool(vision_model() and vision_api_key())


def _is_moonshot(model: str, base_url: str) -> bool:
    model_name = model.lower()
    base = base_url.lower()
    return (
        "moonshot" in base
        or "kimi" in base
        or model_name.startswith("kimi")
    )


async def chat_completion(
    messages: list[dict[str, Any]],
    *,
    temperature: float = 0,
    max_tokens: int = 1024,
    json_mode: bool | None = None,
    timeout: float | None = None,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> str:
    resolved_api_key = (api_key or _api_key()).strip()
    if not resolved_api_key:
        raise LLMNotConfiguredError("LLM_API_KEY 未配置")

    resolved_model = model or _model()
    resolved_base_url = (base_url or _base_url()).rstrip("/")
    payload = {
        "model": resolved_model,
        "messages": messages,
        "stream": False,
    }

    if _is_moonshot(resolved_model, resolved_base_url):
        payload["max_completion_tokens"] = max_tokens
        if resolved_model.lower().startswith("kimi-k3"):
            effort = os.getenv("LLM_REASONING_EFFORT", "").strip().lower()
            if effort in {"low", "high", "max"}:
                payload["reasoning_effort"] = effort
    else:
        payload["temperature"] = temperature
        payload["max_tokens"] = max_tokens

    use_json_mode = _json_mode() if json_mode is None else json_mode
    if use_json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {resolved_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(
            timeout=_timeout() if timeout is None else timeout
        ) as client:
            response = await client.post(
                f"{resolved_base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as error:
        raise LLMError(f"LLM HTTP {error.response.status_code}") from error
    except httpx.HTTPError as error:
        raise LLMError(f"LLM 网络错误：{type(error).__name__}") from error
    except ValueError as error:
        raise LLMResponseError("LLM 返回非 JSON") from error

    if not isinstance(data, dict):
        raise LLMResponseError("LLM 返回格式错误")

    choices = data.get("choices") or []
    if not choices:
        raise LLMResponseError("LLM 返回缺少 choices")

    message = choices[0].get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise LLMResponseError("LLM 返回缺少 message.content")

    return content


def parse_json_object(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if not text:
        raise LLMResponseError("LLM 返回空内容")

    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    candidates = [text]
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload

    raise LLMResponseError("LLM 返回无法解析为 JSON 对象")


async def chat_json(
    system_prompt: str,
    user_input: str,
    *,
    temperature: float = 0,
    max_tokens: int = 1024,
    timeout: float | None = None,
) -> dict[str, Any]:
    content = await chat_completion(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    return parse_json_object(content)


__all__ = [
    "LLMError",
    "LLMNotConfiguredError",
    "LLMResponseError",
    "VisionNotConfiguredError",
    "chat_completion",
    "chat_json",
    "parse_json_object",
    "vision_api_key",
    "vision_base_url",
    "vision_configured",
    "vision_model",
]
