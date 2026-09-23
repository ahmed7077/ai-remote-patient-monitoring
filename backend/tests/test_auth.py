from fastapi.testclient import TestClient


def register(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Synthetic Patient",
            "email": "patient@example.com",
            "password": "correct-horse-battery-staple",
            "role": "PATIENT",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_registration_login_refresh_and_protection(client: TestClient) -> None:
    register(client)
    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "patient@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "patient@example.com", "password": "correct-horse-battery-staple"},
    )
    assert login.status_code == 200
    tokens = login.json()
    me = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )
