CREATE OR REPLACE FUNCTION prevent_last_admin_loss()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  remaining integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'ADMIN' AND OLD."anonymizedAt" IS NULL THEN
      SELECT COUNT(*) INTO remaining
      FROM "User"
      WHERE role = 'ADMIN'
        AND "anonymizedAt" IS NULL
        AND id <> OLD.id;

      IF remaining < 1 THEN
        RAISE EXCEPTION 'Não é possível remover o único administrador';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role = 'ADMIN' AND OLD."anonymizedAt" IS NULL THEN
    IF NEW.role <> 'ADMIN' OR NEW."anonymizedAt" IS NOT NULL THEN
      SELECT COUNT(*) INTO remaining
      FROM "User"
      WHERE role = 'ADMIN'
        AND "anonymizedAt" IS NULL
        AND id <> OLD.id;

      IF remaining < 1 THEN
        RAISE EXCEPTION 'Não é possível remover o único administrador';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_prevent_last_admin ON "User";

CREATE TRIGGER user_prevent_last_admin
BEFORE DELETE OR UPDATE OF role, "anonymizedAt"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION prevent_last_admin_loss();