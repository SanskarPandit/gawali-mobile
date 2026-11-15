import mimetypes
import posixpath
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


@deconstructible
class DatabaseStorage(Storage):
    """Django storage backend that keeps file bytes in the StoredFile table (Postgres in production)."""

    def _model(self):
        from .models import StoredFile
        return StoredFile

    def _open(self, name, mode='rb'):
        f = self._model().objects.filter(name=name).only('content', 'name').first()
        if f is None:
            raise FileNotFoundError(name)
        cf = ContentFile(bytes(f.content), name=name)
        return cf

    def _save(self, name, content):
        content.seek(0) if hasattr(content, 'seek') else None
        data = content.read()
        if isinstance(data, str):
            data = data.encode()
        ctype = getattr(content, 'content_type', None) or mimetypes.guess_type(name)[0] or 'application/octet-stream'
        self._model().objects.create(name=name, content=data, content_type=ctype, size=len(data))
        return name

    def get_available_name(self, name, max_length=None):
        # Unguessable names: media URLs are public links, so they must not be enumerable.
        directory, filename = posixpath.split(name.replace('\\', '/'))
        stem, ext = posixpath.splitext(filename)
        candidate = posixpath.join(directory, f'{stem[:60]}-{uuid.uuid4().hex[:12]}{ext.lower()}')
        while self.exists(candidate):
            candidate = posixpath.join(directory, f'{stem[:60]}-{uuid.uuid4().hex[:12]}{ext.lower()}')
        return candidate

    def exists(self, name):
        return self._model().objects.filter(name=name).exists()

    def delete(self, name):
        self._model().objects.filter(name=name).delete()

    def size(self, name):
        f = self._model().objects.filter(name=name).only('size').first()
        return f.size if f else 0

    def url(self, name):
        from django.conf import settings
        return f'{settings.MEDIA_URL}{name}'
