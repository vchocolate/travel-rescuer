import json
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from .llm import LLMError, chat_completion

ModelT = TypeVar("ModelT", bound=BaseModel)


class LLMValidationError(LLMError):
    pass


def build_schema_prompt(system_prompt: str, model_type: type[BaseModel]) -> str:
    schema = json.dumps(model_type.model_json_schema(), ensure_ascii=False)
    return (
        f"{system_prompt}\n\n"
        "你必须严格按以下 JSON Schema 返回一个 JSON 对象。"
        "只输出 JSON，不要 Markdown、代码块或解释。\n"
        f"{schema}"
    )


async def generate_model(
    model_type: type[ModelT],
    system_prompt: str,
    user_content: str,
    *,
    image_data_url: str | None = None,
    max_tokens: int = 1024,
    timeout: float = 60,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> ModelT:
    system_content = build_schema_prompt(system_prompt, model_type)

    if image_data_url:
        content: Any = [
            {"type": "text", "text": user_content},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ]
    else:
        content = user_content

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": content},
    ]

    raw = await chat_completion(
        messages,
        max_tokens=max_tokens,
        timeout=timeout,
        model=model,
        base_url=base_url,
        api_key=api_key,
    )

    try:
        return model_type.model_validate_json(raw)
    except ValidationError as error:
        raise LLMValidationError(
            f"LLM 输出未通过 {model_type.__name__} 的 JSON Schema 校验"
        ) from error


__all__ = [
    "LLMValidationError",
    "build_schema_prompt",
    "generate_model",
]
