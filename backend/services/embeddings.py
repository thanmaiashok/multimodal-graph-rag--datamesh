import asyncio
import base64
import numpy as np
from sentence_transformers import SentenceTransformer
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import torch
from groq import Groq
from config import settings

text_model = SentenceTransformer("all-MiniLM-L6-v2")

clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

groq_client = Groq(api_key=settings.GROQ_API_KEY)


def get_text_embedding(text: str) -> list[float]:
    embedding = text_model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def get_image_embedding(image_path: str) -> list[float]:
    image = Image.open(image_path).convert("RGB")
    inputs = clip_processor(images=image, return_tensors="pt")
    with torch.no_grad():
        image_features = clip_model.get_image_features(**inputs)
    embedding = image_features[0].numpy()
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()


def get_query_image_embedding(text_query: str) -> list[float]:
    """CLIP text embedding for cross-modal image search."""
    inputs = clip_processor(text=[text_query], return_tensors="pt", padding=True)
    with torch.no_grad():
        text_features = clip_model.get_text_features(**inputs)
    embedding = text_features[0].numpy()
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()


async def caption_image(image_path: str) -> str:
    """Generate rich content description using Groq vision LLM."""
    def _caption():
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        ext = image_path.rsplit(".", 1)[-1].lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/jpeg")
        response = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}"},
                        },
                        {
                            "type": "text",
                            "text": (
                                "Describe this image in detail. Include: main subjects, "
                                "colors, text visible, scene/context, any notable objects, "
                                "and what the image conveys. Be thorough for search indexing."
                            ),
                        },
                    ],
                }
            ],
            max_tokens=512,
            temperature=0.2,
        )
        return response.choices[0].message.content or ""

    try:
        return await asyncio.to_thread(_caption)
    except Exception as e:
        print(f"Vision caption error: {e}")
        return ""


async def transcribe_audio(file_path: str) -> str:
    def _transcribe():
        with open(file_path, "rb") as f:
            return groq_client.audio.transcriptions.create(
                file=(file_path.split("/")[-1], f.read()),
                model="whisper-large-v3",
                response_format="text",
            )
    transcription = await asyncio.to_thread(_transcribe)
    return transcription if isinstance(transcription, str) else transcription.text
