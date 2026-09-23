import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Software-only academic RPM prototype; not a medical device.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_error(_: Request, exc: Exception) -> JSONResponse:
    logging.getLogger("rpm.api").exception("Unhandled API error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred"})


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "healthy", "service": "rpm-api"}
