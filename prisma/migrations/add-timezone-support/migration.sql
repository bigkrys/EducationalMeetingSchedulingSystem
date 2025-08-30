-- Add timezone column to teachers if not exists
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'teachers' AND column_name = 'timezone'
	) THEN
		ALTER TABLE "teachers" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai';
	END IF;
END $$;

-- Change teacher_availability startTime/endTime to TEXT if they are not TEXT
DO $$
DECLARE
	v_data_type_start TEXT;
	v_data_type_end TEXT;
BEGIN
	SELECT data_type INTO v_data_type_start
	FROM information_schema.columns
	WHERE table_name = 'teacher_availability' AND column_name = 'startTime';

	SELECT data_type INTO v_data_type_end
	FROM information_schema.columns
	WHERE table_name = 'teacher_availability' AND column_name = 'endTime';

	IF v_data_type_start IS NULL THEN
		-- Column not exists (fresh db), create as TEXT
		ALTER TABLE "teacher_availability" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
	ELSIF v_data_type_start <> 'text' THEN
		-- Convert to TEXT preserving value via to_char if needed
		ALTER TABLE "teacher_availability" ALTER COLUMN "startTime" TYPE TEXT USING to_char("startTime", 'HH24:MI');
	END IF;

	IF v_data_type_end IS NULL THEN
		ALTER TABLE "teacher_availability" ADD COLUMN IF NOT EXISTS "endTime" TEXT;
	ELSIF v_data_type_end <> 'text' THEN
		ALTER TABLE "teacher_availability" ALTER COLUMN "endTime" TYPE TEXT USING to_char("endTime", 'HH24:MI');
	END IF;
END $$;

-- Ensure defaults/nullability for new TEXT columns
ALTER TABLE "teacher_availability"
	ALTER COLUMN "startTime" SET NOT NULL,
	ALTER COLUMN "endTime" SET NOT NULL;
