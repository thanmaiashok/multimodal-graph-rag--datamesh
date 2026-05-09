from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GROQ_API_KEY: str
    NEO4J_URI: str = "bolt://neo4j:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password123"
    CHROMADB_HOST: str = "chromadb"
    CHROMADB_PORT: int = 8000
    UPLOAD_DIR: str = "/app/uploads"
    PUBLIC_BACKEND_URL: str = "http://localhost:8000"

    class Config:
        env_file = ".env"


settings = Settings()
