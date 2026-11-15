-- audit_log es solo de inserción (#223): la base rechaza cualquier UPDATE y cualquier DELETE,
-- salvo el de la supresión de datos de un cliente (Ley 25.326, ADR 0015), que lo habilita en su
-- transacción con `set_config('norde.audit_erasure', 'on', true)`. TRUNCATE (tests) no lo dispara.
CREATE OR REPLACE FUNCTION "core"."audit_log_insert_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('norde.audit_erasure', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is insert-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_log_insert_only" ON "core"."audit_log";
--> statement-breakpoint
CREATE TRIGGER "audit_log_insert_only"
BEFORE UPDATE OR DELETE ON "core"."audit_log"
FOR EACH ROW EXECUTE FUNCTION "core"."audit_log_insert_only"();
