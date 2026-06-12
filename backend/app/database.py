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
        await conn.execute(text("""
            UPDATE users SET role = 'admin' WHERE role = 'owner';
            UPDATE users SET role = 'barista' WHERE role = 'employee';
        """))

        # ─── Migration: drop old column ────────────────────────────────────
        await conn.execute(text("""
            ALTER TABLE users DROP COLUMN IF EXISTS auth_code;
        """))

        # ─── Create all tables/enums (safe: skips existing) ────────────────
        await conn.run_sync(Base.metadata.create_all)

        # ─── Unique index for invite_token (separate from ADD COLUMN) ──────
        await conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ix_users_invite_token
            ON users(invite_token)
            WHERE invite_token IS NOT NULL
        """))