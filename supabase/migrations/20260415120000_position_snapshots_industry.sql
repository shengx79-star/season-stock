alter table position_snapshots
  add column if not exists industry     text not null default '',
  add column if not exists theme_cluster text not null default '';
