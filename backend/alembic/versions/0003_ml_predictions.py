"""Persist versioned ML prediction provenance separately from rule-based risk."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ml_predictions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("model_identifier", sa.String(length=80), nullable=False),
        sa.Column("model_version", sa.String(length=80), nullable=False),
        sa.Column("assessment_method", sa.String(length=50), nullable=False),
        sa.Column("predicted_label", sa.String(length=80), nullable=False),
        sa.Column("probability", sa.Float(), nullable=False),
        sa.Column("decision_threshold", sa.Float(), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_data", sa.String(length=30), nullable=False),
        sa.Column("feature_snapshot", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.String(length=1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ml_predictions_patient_id", "ml_predictions", ["patient_id"])
    op.create_index("ix_ml_predictions_model_version", "ml_predictions", ["model_version"])


def downgrade() -> None:
    op.drop_index("ix_ml_predictions_model_version", table_name="ml_predictions")
    op.drop_index("ix_ml_predictions_patient_id", table_name="ml_predictions")
    op.drop_table("ml_predictions")
