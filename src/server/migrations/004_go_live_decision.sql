-- Readiness gains an "in progress" stage, and each system gets a go-live decision.
-- Systems decided "no" are left out of the countdown's readiness figures.
ALTER TABLE systems DROP CONSTRAINT systems_status_check;
ALTER TABLE systems ADD CONSTRAINT systems_status_check
  CHECK (status IN ('not_ready', 'in_progress', 'ready', 'live'));

ALTER TABLE systems ADD COLUMN go_live varchar(3) NOT NULL DEFAULT 'tbd'
  CHECK (go_live IN ('yes', 'no', 'tbd'));
-- Anything already marked ready or live is clearly going live.
UPDATE systems SET go_live = 'yes' WHERE status IN ('ready', 'live');
