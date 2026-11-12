"""Add clinician notes, follow-ups and published care summaries."""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "care_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("body", sa.String(4000), nullable=False),
        sa.Column("precautions", sa.String(4000)),
        sa.Column("due_date", sa.String(10)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_care_entries_patient_id", "care_entries", ["patient_id"])


def downgrade() -> None:
    op.drop_index("ix_care_entries_patient_id", table_name="care_entries")
    op.drop_table("care_entries")
