"""
Uploads in Neon Object Storage (S3-compatible, branch-scoped, private bucket).

Credentials, endpoint and region come from the AWS-standard variables that `neon deploy` writes
(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION). Postgres stores only the
object key. Files are linked as /media/<key>; that view redirects to a short-lived presigned URL, so a
link saved in a notification never expires and the bucket itself stays private.
"""
import mimetypes
import posixpath
import uuid
from functools import cached_property

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

PRESIGN_SECONDS = 15 * 60


@deconstructible
class NeonObjectStorage(Storage):
    def __init__(self, bucket: str | None = None):
        self.bucket = bucket or settings.NEON_STORAGE_BUCKET

    @cached_property
    def client(self):
        import boto3
        from botocore.config import Config

        return boto3.client(
            's3',
            endpoint_url=settings.AWS_ENDPOINT_URL_S3,
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            # Neon requires path-style addressing and SigV4.
            config=Config(signature_version='s3v4', s3={'addressing_style': 'path'},
                          retries={'max_attempts': 3, 'mode': 'standard'}, connect_timeout=5, read_timeout=20),
        )

    def _open(self, name, mode='rb'):
        obj = self.client.get_object(Bucket=self.bucket, Key=name)
        return ContentFile(obj['Body'].read(), name=name)

    def _save(self, name, content):
        if hasattr(content, 'seek'):
            content.seek(0)
        data = content.read()
        if isinstance(data, str):
            data = data.encode()
        ctype = getattr(content, 'content_type', None) or mimetypes.guess_type(name)[0] or 'application/octet-stream'
        self.client.put_object(Bucket=self.bucket, Key=name, Body=data, ContentType=ctype)
        return name

    def get_available_name(self, name, max_length=None):
        # Unguessable keys: /media links are shareable, so they must not be enumerable.
        directory, filename = posixpath.split(name.replace('\\', '/'))
        stem, ext = posixpath.splitext(filename)
        return posixpath.join(directory, f'{stem[:60]}-{uuid.uuid4().hex[:16]}{ext.lower()}')

    def exists(self, name):
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.bucket, Key=name)
            return True
        except ClientError:
            return False

    def delete(self, name):
        self.client.delete_object(Bucket=self.bucket, Key=name)

    def size(self, name):
        return self.client.head_object(Bucket=self.bucket, Key=name)['ContentLength']

    def url(self, name):
        return f'{settings.MEDIA_URL}{name}'

    def presigned_url(self, name, seconds: int = PRESIGN_SECONDS) -> str:
        return self.client.generate_presigned_url('get_object', Params={'Bucket': self.bucket, 'Key': name}, ExpiresIn=seconds)
