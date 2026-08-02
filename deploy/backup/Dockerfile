# Backup-Container: pg_dump (passend zu Postgres 16) + rsync/ssh für den
# optionalen Push zur Synology.
FROM postgres:16-alpine

RUN apk add --no-cache rsync openssh-client tzdata

COPY backup.sh /usr/local/bin/backup.sh
COPY restore.sh /usr/local/bin/restore.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

ENTRYPOINT ["/usr/local/bin/backup.sh"]
