import hashlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.database import get_db
from app.models import RefreshToken, User
from app.schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserResponse
from app.security import (
    create_access_token,
    current_user,
    hash_password,
    issue_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


def tokens(db: Session, user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user), refresh_token=issue_refresh_token(db, user)
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()
    record_audit(db, "REGISTER", "USER", user.id, str(user.id))
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    record_audit(db, "LOGIN", "USER", user.id, str(user.id))
    db.commit()
    return tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    token_hash = hashlib.sha256(payload.refresh_token.encode()).hexdigest()
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if (
        stored is None
        or stored.revoked
        or stored.expires_at.replace(tzinfo=UTC) <= datetime.now(UTC)
    ):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    stored.revoked = True
    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    db.commit()
    return tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    payload: RefreshRequest, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> None:
    token_hash = hashlib.sha256(payload.refresh_token.encode()).hexdigest()
    stored = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash, RefreshToken.user_id == user.id
        )
    )
    if stored:
        stored.revoked = True
    record_audit(db, "LOGOUT", "USER", user.id, str(user.id))
    db.commit()


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(current_user)) -> User:
    return user
