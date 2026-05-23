DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessagingComplianceType')
     AND EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'MessagingComplianceType'
         AND e.enumlabel = 'TOLL_FREE'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'MessagingComplianceType'
         AND e.enumlabel = 'TOLL_FREE_VERIFICATION'
     ) THEN
    ALTER TYPE "MessagingComplianceType" RENAME VALUE 'TOLL_FREE' TO 'TOLL_FREE_VERIFICATION';
  END IF;
END $$;
