
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_patient_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_doctor_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_patient_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_doctor_id() TO authenticated, service_role;
