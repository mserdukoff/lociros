"""Trial, Stripe subscription state, webhook ledger, and LLM usage.

Revision ID: 0008_billing
Revises: 0007_supabase_auth
Create Date: 2026-10-02

Startup may already have added these columns and tables (init_db runs
create_all and patches users), so every step checks before it acts.
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_billing"
down_revision = "0007_supabase_auth"
branch_labels = None
depends_on = None

USER_COLUMNS = (
    sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("stripe_customer_id", sa.String(64), nullable=True),
    sa.Column("stripe_subscription_id", sa.String(64), nullable=True),
    sa.Column("subscription_status", sa.String(24), nullable=True),
    sa.Column("subscription_plan", sa.String(16), nullable=True),
    sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
    sa.Column(
        "cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()
    ),
)


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    tables = set(insp.get_table_names())
    existing = {c["name"] for c in insp.get_columns("users")}
    for col in USER_COLUMNS:
        if col.name not in existing:
            op.add_column("users", col.copy())
    indexes = {ix["name"] for ix in insp.get_indexes("users")}
    if "ix_users_stripe_customer_id" not in indexes:
        op.create_index(
            "ix_users_stripe_customer_id", "users", ["stripe_customer_id"], unique=True
        )

    if "stripe_events" not in tables:
        op.create_table(
            "stripe_events",
            sa.Column("id", sa.String(80), primary_key=True),
            sa.Column("kind", sa.String(80), nullable=False),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        )

    if "llm_usage" not in tables:
        op.create_table(
            "llm_usage",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("account_key", sa.String(80), nullable=False),
            sa.Column("year_month", sa.String(7), nullable=False),
            sa.Column("calls", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("account_key", "year_month"),
        )
        op.create_index("ix_llm_usage_account_key", "llm_usage", ["account_key"])

    if op.get_bind().dialect.name == "postgresql":
        for table in ("stripe_events", "llm_usage"):
            op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index("ix_llm_usage_account_key", table_name="llm_usage")
    op.drop_table("llm_usage")
    op.drop_table("stripe_events")
    op.drop_index("ix_users_stripe_customer_id", table_name="users")
    for col in reversed(USER_COLUMNS):
        op.drop_column("users", col.name)
