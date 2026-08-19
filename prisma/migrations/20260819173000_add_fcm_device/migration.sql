-- CreateTable
CREATE TABLE IF NOT EXISTS "fcm_devices" (
    "id" TEXT NOT NULL,
    "auth_id" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "device_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fcm_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "fcm_devices_auth_id_fcm_token_key" ON "fcm_devices"("auth_id", "fcm_token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fcm_devices_auth_id_is_active_idx" ON "fcm_devices"("auth_id", "is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fcm_devices_fcm_token_idx" ON "fcm_devices"("fcm_token");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fcm_devices_auth_id_fkey'
    ) THEN
        ALTER TABLE "fcm_devices" ADD CONSTRAINT "fcm_devices_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
