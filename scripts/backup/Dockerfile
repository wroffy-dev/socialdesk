# Backup image: the script is baked in rather than bind-mounted, because hosts such as Coolify
# don't keep the repository's files on the server (a missing bind source becomes an empty folder).
FROM postgres:16-alpine
COPY run.sh /run.sh
ENTRYPOINT ["/bin/sh", "/run.sh"]
