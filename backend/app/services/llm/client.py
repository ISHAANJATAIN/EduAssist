from functools import lru_cache

from langchain_core.embeddings import Embeddings
from langchain_core.runnables import Runnable

from app.core.config import get_settings
from app.core.errors import AppError


@lru_cache
def get_embeddings() -> Embeddings:
    settings = get_settings()
    from langchain_huggingface import HuggingFaceEmbeddings

    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )


@lru_cache
def get_chat_model() -> Runnable:
    settings = get_settings()

    if settings.llm_provider == "groq":
        if not settings.groq_api_key:
            raise AppError(
                "llm_unavailable",
                "GROQ_API_KEY is not configured on the server.",
                503,
            )
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=settings.llm_model,
            api_key=settings.groq_api_key,
            temperature=0,
        )

    from langchain_ollama import ChatOllama

    model = ChatOllama(
        model=settings.llm_model,
        base_url=settings.ollama_base_url,
        temperature=0,
        num_ctx=settings.llm_num_ctx,
        num_predict=settings.llm_num_predict,
    )
    # Qwen3 thinking can loop past the context window on structured JSON tasks.
    return model.bind(think=False)
