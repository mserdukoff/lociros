"""One learner row per account and language; index the shelf query.

Revision ID: 0009_learner_indexes
Revises: 0008_billing
Create Date: 2026-10-13

Signed-in lookups filter learners by user_id, but the only unique key was
(device_id, language). The shelf lists public passages by language, newest first.
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_learner_indexes"
down_revision = "0008_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    learners = {ix["name"] for ix in insp.get_indexes("learners")}
    if "ix_learners_user_language" not in learners:
        op.create_index(
            "ix_learners_user_language",
            "learners",
            ["user_id", "language"],
            unique=True,
            postgresql_where=sa.text("user_id IS NOT NULL"),
            sqlite_where=sa.text("user_id IS NOT NULL"),
        )
    passages = {ix["name"] for ix in insp.get_indexes("passages")}
    if "ix_passages_language_shelf_created" not in passages:
        op.create_index(
            "ix_passages_language_shelf_created",
            "passages",
            ["language", "shelf_status", "created_at"],
        )


def downgrade() -> None:
    op.drop_index("ix_passages_language_shelf_created", table_name="passages")
    op.drop_index("ix_learners_user_language", table_name="learners")
