# Data Layout

- `data/users/{userId}`：用户隔离数据目录，预留 memory、persona、voice、face、chat、cache、backups 子目录。
- `data/system`：系统日志、审计与系统级备份目录。
- `data/tmp`：临时处理中间文件目录。

所有业务数据后续应在写入后接入本地加密与索引同步策略。
