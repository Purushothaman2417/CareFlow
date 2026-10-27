ALTER TABLE public.doctors ALTER COLUMN user_id DROP NOT NULL;
INSERT INTO public.doctors (full_name, specialty, qualification, experience_years, consultation_fee, clinic_name, city, bio, available_days, rating) VALUES
('Dr. Ananya Rao','Cardiology','MBBS, MD, DM (Cardiology)',14,900,'HeartCare Clinic','Bengaluru','Interventional cardiologist focused on preventive heart health and hypertension.',ARRAY['Mon','Tue','Wed','Thu','Fri'],4.8),
('Dr. Rahul Mehta','General Medicine','MBBS, MD',9,400,'CityLife Health','Mumbai','Family physician for fevers, diabetes, thyroid and routine checkups.',ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'],4.6),
('Dr. Priya Nair','Dermatology','MBBS, MD (Dermatology)',11,700,'SkinFirst Clinic','Kochi','Acne, eczema, psoriasis and hair-loss treatment.',ARRAY['Tue','Wed','Thu','Sat'],4.7),
('Dr. Arjun Iyer','Pediatrics','MBBS, DCH, MD',12,600,'Little Steps Children''s Clinic','Chennai','Child health, vaccinations and growth monitoring.',ARRAY['Mon','Wed','Fri','Sat'],4.9),
('Dr. Kavya Reddy','Orthopedics','MBBS, MS (Ortho)',10,800,'BoneWell Hospital','Hyderabad','Sports injuries, joint pain and fracture care.',ARRAY['Mon','Tue','Thu','Fri'],4.5),
('Dr. Vikram Singh','Neurology','MBBS, MD, DM (Neuro)',16,1000,'NeuroPoint Centre','Delhi','Migraine, epilepsy, stroke recovery and nerve disorders.',ARRAY['Tue','Wed','Thu'],4.8),
('Dr. Meera Krishnan','Gynecology','MBBS, MS (OBG)',13,750,'WomanCare Clinic','Coimbatore','Pregnancy care, PCOS and women''s wellness.',ARRAY['Mon','Tue','Wed','Fri','Sat'],4.7),
('Dr. Sanjay Kulkarni','Psychiatry','MBBS, MD (Psychiatry)',15,900,'MindSpace Clinic','Pune','Anxiety, depression, sleep problems and counselling.',ARRAY['Mon','Wed','Thu','Fri'],4.6),
('Dr. Fatima Sheikh','ENT','MBBS, MS (ENT)',8,550,'ClearSound ENT','Lucknow','Sinus, ear infections, hearing and throat care.',ARRAY['Mon','Tue','Thu','Sat'],4.4),
('Dr. Rohan Das','Ophthalmology','MBBS, MS (Ophthalmology)',10,650,'VisionPlus Eye Centre','Kolkata','Eye exams, cataract and glaucoma management.',ARRAY['Tue','Wed','Fri','Sat'],4.6),
('Dr. Lakshmi Sundaram','General Medicine','MBBS, DNB',20,500,'Sundaram Family Clinic','Madurai','Senior physician for chronic disease care.',ARRAY['Mon','Tue','Wed','Thu','Fri'],4.9),
('Dr. Aditya Kapoor','Cardiology','MBBS, MD, DNB (Cardio)',7,850,'Pulse Heart Institute','Jaipur','Heart rhythm disorders and cardiac screening.',ARRAY['Mon','Thu','Fri','Sat'],4.5);