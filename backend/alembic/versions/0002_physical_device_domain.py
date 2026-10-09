"""Add hardware-ready measurement and device credential fields."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE vitaltype ADD VALUE IF NOT EXISTS 'RESPIRATORY_RATE'")

    if "device_credentials" not in inspector.get_table_names():
        op.create_table(
            "device_credentials",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("device_id", sa.Uuid(), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("token_prefix", sa.String(length=16), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash"),
        )
        op.create_index("ix_device_credentials_device_id", "device_credentials", ["device_id"])

    existing_columns = {column["name"] for column in inspector.get_columns("measurement_sessions")}
    additions = {
        "device_session_id": sa.Column("device_session_id", sa.String(80)),
        "acquisition_duration_seconds": sa.Column("acquisition_duration_seconds", sa.Float()),
        "algorithm_version": sa.Column("algorithm_version", sa.String(40)),
        "signal_quality": sa.Column("signal_quality", sa.JSON()),
        "measurement_availability": sa.Column("measurement_availability", sa.JSON()),
        "device_error_code": sa.Column("device_error_code", sa.String(80)),
    }
    existing_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("measurement_sessions")
    }
    with op.batch_alter_table("measurement_sessions") as batch_op:
        for name, column in additions.items():
            if name not in existing_columns:
                batch_op.add_column(column)
        if "uq_device_session_id" not in existing_constraints:
            batch_op.create_unique_constraint(
                "uq_device_session_id", ["device_id", "device_session_id"]
            )


def downgrade() -> None:
    with op.batch_alter_table("measurement_sessions") as batch_op:
        batch_op.drop_constraint("uq_device_session_id", type_="unique")
        batch_op.drop_column("device_error_code")
        batch_op.drop_column("measurement_availability")
        batch_op.drop_column("signal_quality")
        batch_op.drop_column("algorithm_version")
        batch_op.drop_column("acquisition_duration_seconds")
        batch_op.drop_column("device_session_id")
    op.drop_index("ix_device_credentials_device_id", table_name="device_credentials")
    op.drop_table("device_credentials")
    # PostgreSQL enum values are intentionally retained to avoid rewriting historical data.
