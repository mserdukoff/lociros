"""Link public.users to auth.users and keep profiles in sync.

Revision ID: 0007_supabase_auth
Revises: 0006_news_saves
Create Date: 2026-09-23
"""

from alembic import op

revision = "0007_supabase_auth"
down_revision = "0006_news_saves"
branch_labels = None
depends_on = None


HANDLE_NEW = """
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  display text;
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN new;
  END IF;

  display := nullif(
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    ''
  );

  UPDATE public.users
  SET
    auth_id = new.id,
    email = coalesce(lower(new.email), public.users.email),
    display_name = coalesce(display, public.users.display_name)
  WHERE public.users.auth_id = new.id
     OR (
       new.email IS NOT NULL
       AND public.users.email = lower(new.email)
       AND public.users.auth_id IS NULL
     );

  IF found THEN
    RETURN new;
  END IF;

  BEGIN
    INSERT INTO public.users (email, display_name, auth_id, created_at)
    VALUES (
      CASE WHEN new.email IS NULL THEN NULL ELSE lower(new.email) END,
      coalesce(display, 'reader'),
      new.id,
      timezone('utc', now())
    )
    ON CONFLICT (auth_id) DO UPDATE
      SET
        email = coalesce(excluded.email, public.users.email),
        display_name = coalesce(excluded.display_name, public.users.display_name);
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.users
    SET
      auth_id = new.id,
      display_name = coalesce(display, public.users.display_name)
    WHERE public.users.email = lower(new.email)
      AND public.users.auth_id IS NULL;
  END;

  RETURN new;
END;
$function$;
"""

HANDLE_UPDATED = """
CREATE OR REPLACE FUNCTION private.handle_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN new;
  END IF;

  UPDATE public.users
  SET
    email = CASE
      WHEN new.email IS NOT NULL THEN lower(new.email)
      ELSE public.users.email
    END,
    display_name = coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      public.users.display_name
    )
  WHERE public.users.auth_id = new.id;
  RETURN new;
END;
$function$;
"""


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("CREATE SCHEMA IF NOT EXISTS private")
    op.execute(HANDLE_NEW)
    op.execute(HANDLE_UPDATED)
    op.execute(
        """
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW
          EXECUTE FUNCTION private.handle_new_user();
        DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
        CREATE TRIGGER on_auth_user_updated
          AFTER UPDATE OF email, raw_user_meta_data ON auth.users
          FOR EACH ROW
          EXECUTE FUNCTION private.handle_user_updated();
        """
    )
    op.execute("ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_auth_id_fkey")
    op.execute(
        """
        ALTER TABLE public.users
          ADD CONSTRAINT users_auth_id_fkey
          FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE
        """
    )
    op.execute(
        """
        REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
        REVOKE ALL ON FUNCTION private.handle_user_updated() FROM PUBLIC, anon, authenticated;
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_auth_id_fkey")
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users")
    op.execute("DROP FUNCTION IF EXISTS private.handle_user_updated()")
