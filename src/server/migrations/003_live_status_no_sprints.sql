-- Sprint length is no longer used.
ALTER TABLE settings DROP COLUMN sprint_weeks;

-- Systems move through three states: not ready -> ready for go-live -> live.
ALTER TABLE systems ADD COLUMN status varchar(10) NOT NULL DEFAULT 'not_ready'
  CHECK (status IN ('not_ready', 'ready', 'live'));
UPDATE systems SET status = 'ready' WHERE ready;
ALTER TABLE systems DROP COLUMN ready;
