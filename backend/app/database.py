from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
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
        # ─── Migration: add new columns (safe for existing tables) ──────────
        await conn.execute(text("""
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64)
        """))

        # ─── Migration: handle enum change (owner→admin, employee→barista) ─
        # Drop the old PostgreSQL enum type and convert column to VARCHAR
        # so SQLAlchemy can recreate the enum with new values via create_all
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
                    ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(16);
                    DROP TYPE user_role CASCADE;
                END IF;
            END $$;
        """))

        # Update old role values to new ones
        await conn.execute(text("UPDATE users SET role = 'admin' WHERE role = 'owner'"))
        await conn.execute(text("UPDATE users SET role = 'barista' WHERE role = 'employee'"))

        # ─── Migration: drop old column ────────────────────────────────────
        await conn.execute(text("""
            ALTER TABLE users DROP COLUMN IF EXISTS auth_code;
        """))

        # ─── Migration: add revenue/pay_model columns to users ─────────────
        await conn.execute(text("""
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS revenue_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
                ADD COLUMN IF NOT EXISTS pay_model VARCHAR(16) NOT NULL DEFAULT 'hourly'
        """))

        # ─── Migration: add revenue column to shifts ───────────────────────
        await conn.execute(text("""
            ALTER TABLE shifts
                ADD COLUMN IF NOT EXISTS revenue NUMERIC(10,2)
        """))

        # ─── Migration: create audit_logs table ────────────────────────────
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

        # ─── Migration: create adjustments table ───────────────────────────
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

        # ─── Migration: drop old shift_status enum and recreate ─────────────
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_status') THEN
                    ALTER TABLE shifts ALTER COLUMN status TYPE VARCHAR(16);
                    DROP TYPE shift_status CASCADE;
                END IF;
            END $$;
        """))

        # ─── Create all tables/enums (safe: skips existing) ────────────────
        await conn.run_sync(Base.metadata.create_all)

        # ─── Unique index for invite_token (separate from ADD COLUMN) ──────
        await conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ix_users_invite_token
            ON users(invite_token)
            WHERE invite_token IS NOT NULL
        """))