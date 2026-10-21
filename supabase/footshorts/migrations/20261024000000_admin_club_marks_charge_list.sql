-- Club marks, spec 2.1: no white disc; a mark carries up to 8 plain-shape charges, each
-- with a scale, rotation and offset. The charge columns keep their text type and now
-- hold a ';'-separated list, e.g. "triangle:#CF2D36;star:#FFFFFF@0.5,15,-12,8"
-- (shape:#hex[@scale,rotate,x,y]). Validated in the app (@vismay/club-marks
-- chargesFromText), so the single-shape check from 20261023000000 is dropped.

alter table public.admin_club_marks drop constraint if exists admin_club_marks_override_charge_check;
