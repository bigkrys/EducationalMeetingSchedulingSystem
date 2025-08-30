-- Add unique constraint on appointments (teacherId, scheduledTime)
-- This migration is idempotent: it will only add the constraint if it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE c.contype = 'u'
          AND n.nspname = 'public'
          AND t.relname = 'appointments'
          AND EXISTS (
            SELECT 1 FROM pg_constraint_key k
            WHERE k.conname = c.conname
          )
    ) THEN
        ALTER TABLE public.appointments
        ADD CONSTRAINT appointments_teacher_scheduledtime_unique UNIQUE ("teacherId", "scheduledTime");
    END IF;
EXCEPTION WHEN duplicate_table OR unique_violation THEN
    -- ignore if already exists
END$$;
