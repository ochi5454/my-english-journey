# 既存モデル（維持）
from backend.models.user import User  # noqa: F401
from backend.models.token_store import TokenStore  # noqa: F401

# 新規モデル（メール送信エージェント用）
from backend.models.email_template import EmailTemplate  # noqa: F401
from backend.models.recipient import RecipientList, RecipientListMember  # noqa: F401
from backend.models.mail_log import MailSendLog  # noqa: F401
from backend.models.attachment import TempAttachment  # noqa: F401
from backend.models.scheduled_mail import ScheduledMail  # noqa: F401

# 組織・従業員モデル（部署単位での宛先指定用）
from backend.models.organization import (  # noqa: F401
    Organization,
    EmployeeAssignment,
    EntraSyncLog,
    EmployeeTransferHistory,
)

# 以下は削除予定（データ管理機能）
# from backend.models.excel import ExcelFile, ExcelCell  # noqa: F401
# from backend.models.dataset import Dataset  # noqa: F401
# from backend.models.tournament import Tournament, Task, Document, Alert  # noqa: F401
