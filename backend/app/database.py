from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import settings


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(_normalize_database_url(settings.DATABASE_URL), echo=settings.DEBUG)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        # Ensure all mapped tables exist before any runtime compatibility SQL runs.
        await conn.run_sync(Base.metadata.create_all)

        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = 'pay_model'
                ) THEN
                    ALTER TYPE pay_model ADD VALUE IF NOT EXISTS 'fixed_shift';
                END IF;
            END $$;
        """))

        await conn.execute(text("""
            DO $$
            DECLARE
                has_admin_role boolean := false;
                has_barista_role boolean := false;
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'users'
                ) AND EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = 'user_role'
                ) THEN
                    SELECT EXISTS (
                        SELECT 1
                        FROM pg_enum enum_value
                        JOIN pg_type enum_type ON enum_value.enumtypid = enum_type.oid
                        WHERE enum_type.typname = 'user_role' AND enum_value.enumlabel = 'admin'
                    ) INTO has_admin_role;

                    SELECT EXISTS (
                        SELECT 1
                        FROM pg_enum enum_value
                        JOIN pg_type enum_type ON enum_value.enumtypid = enum_type.oid
                        WHERE enum_type.typname = 'user_role' AND enum_value.enumlabel = 'barista'
                    ) INTO has_barista_role;

                    IF has_admin_role THEN
                        UPDATE users SET role = 'admin' WHERE role::text = 'owner';
                    END IF;

                    IF has_barista_role THEN
                        UPDATE users SET role = 'barista' WHERE role::text = 'employee';
                    END IF;
                END IF;
            END $$;
        """))

        # Runtime compatibility SQL must only run after create_all.
        await conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'venues' AND column_name = 'is_active') THEN
                ALTER TABLE venues ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
            END IF;
        END $$;
        """))

        await conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'is_active') THEN
                    ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;
                END IF;
            END $$;
        """))

        await conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'users' AND column_name = 'invite_token') THEN
                    ALTER TABLE users ADD COLUMN invite_token VARCHAR(64);
                END IF;
            END $$;
        """))

        await conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'users' AND column_name = 'revenue_percentage') THEN
                    ALTER TABLE users ADD COLUMN revenue_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00;
                END IF;
            END $$;
        """))

        await conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'pay_model') THEN
                ALTER TABLE users ADD COLUMN pay_model VARCHAR(16) NOT NULL DEFAULT 'hourly';
            END IF;
        END $$;
        """))

        await conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'position') THEN
                ALTER TABLE users ADD COLUMN position VARCHAR(255);
            END IF;
        END $$;
        """))

        await conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'permissions') THEN
                ALTER TABLE users ADD COLUMN permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
            END IF;
        END $$;
        """))

        await conn.execute(text("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'auth_code') THEN
                    ALTER TABLE users DROP COLUMN auth_code;
                END IF;
            END $$;
        """))

        await conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'shifts' AND column_name = 'revenue') THEN
                    ALTER TABLE shifts ADD COLUMN revenue NUMERIC(10,2);
                END IF;
            END $$;
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id),
                target_user_id UUID REFERENCES users(id),
                venue_id UUID NOT NULL REFERENCES venues(id),
                action VARCHAR(50) NOT NULL,
                entity_type VARCHAR(50) NOT NULL,
                entity_id UUID,
                old_value JSONB,
                new_value JSONB,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS adjustments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id),
                venue_id UUID NOT NULL REFERENCES venues(id),
                type VARCHAR(16) NOT NULL,
                amount NUMERIC(10,2) NOT NULL,
                reason VARCHAR(500) NOT NULL,
                created_by UUID NOT NULL REFERENCES users(id),
                month INTEGER NOT NULL,
                year INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """))

        await conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ix_users_invite_token
            ON users(invite_token)
            WHERE invite_token IS NOT NULL
        """))
