"""Private encrypted key storage. No decryption or key passwords here."""
import base64
import binascii
import json
from datetime import datetime

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import ParseError, ValidationError
from rest_framework.parsers import BaseParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import KeyEnvelope


class BoundedJSONParser(BaseParser):
    media_type = "application/json"

    def parse(self, stream, media_type=None, parser_context=None):
        raw = stream.read(32769)
        if len(raw) > 32768:
            raise ParseError("Envelope request exceeds 32 KiB.")
        try:
            return json.loads(raw)
        except (ValueError, UnicodeError, RecursionError):
            raise ParseError("Invalid JSON.")


def validate_envelope(b):
    def exact(o, keys):
        return isinstance(o, dict) and set(o) == set(keys)

    def binary(s, minimum, maximum):
        if not isinstance(s, str) or len(s) > 22000:
            raise ValueError
        v = base64.b64decode(s, validate=True)
        if base64.b64encode(v).decode() != s or not minimum <= len(v) <= maximum:
            raise ValueError

    try:
        if not exact(b, ["format", "kdf", "enc", "pub", "data", "createdAt"]) or b["format"] != "zk-keybundle-v2":
            raise ValueError
        k, e = b["kdf"], b["enc"]
        if not exact(k, ["name", "hash", "iterations", "salt"]) or not exact(e, ["name", "iv"]):
            raise ValueError
        if k["name"] != "PBKDF2" or k["hash"] != "SHA-256" or e["name"] != "AES-GCM":
            raise ValueError
        if type(k["iterations"]) is not int or not 600000 <= k["iterations"] <= 1000000:
            raise ValueError
        if not isinstance(b["createdAt"], str) or len(b["createdAt"]) > 40:
            raise ValueError
        datetime.fromisoformat(b["createdAt"].replace("Z", "+00:00"))
        binary(k["salt"], 16, 16)
        binary(e["iv"], 12, 12)
        binary(b["pub"], 256, 1024)
        binary(b["data"], 1024, 16384)
    except (ValueError, TypeError, KeyError, binascii.Error):
        raise ValidationError("Unsupported or malformed encrypted envelope.")
    return b


class KeyEnvelopeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [BoundedJSONParser]
    http_method_names = ["get", "put", "head", "options"]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response

    def get(self, request):
        row = KeyEnvelope.objects.filter(owner=request.user).first()
        if row is None:
            return Response({"detail": "No envelope."}, status=404)
        return Response({"envelope": row.envelope, "revision": row.revision})

    def put(self, request):
        data = request.data
        if not isinstance(data, dict) or set(data) != {"envelope", "expected_revision"}:
            raise ValidationError("Only envelope and expected_revision are accepted.")
        revision = data["expected_revision"]
        if type(revision) is not int or not 0 <= revision < 9223372036854775807:
            raise ValidationError("Invalid expected_revision.")
        envelope = validate_envelope(data["envelope"])
        # Lock the account even for first creation: serializes absent-row races.
        with transaction.atomic():
            get_user_model().objects.select_for_update().get(pk=request.user.pk)
            row = KeyEnvelope.objects.filter(owner=request.user).first()
            current = row.revision if row else 0
            if current != revision:
                return Response({"detail": "Envelope changed. Reload before retrying.", "revision": current}, status=409)
            if row and row.envelope["pub"] != envelope["pub"]:
                raise ValidationError("Key rotation is not supported. Preserve the existing pair.")
            if row:
                row.envelope = envelope
                row.revision += 1
                row.save(update_fields=["envelope", "revision", "updated_at"])
            else:
                row = KeyEnvelope.objects.create(owner=request.user, envelope=envelope)
        return Response({"envelope": row.envelope, "revision": row.revision}, status=200 if current else 201)
