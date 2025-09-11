from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.authentication import SessionAuthentication, BasicAuthentication

@api_view(["GET"])
@authentication_classes([JWTAuthentication, SessionAuthentication, BasicAuthentication])
@permission_classes([IsAuthenticated])
def jwt_whoami(request):
    u = request.user
    return Response({"id": u.id, "username": u.username, "email": getattr(u, "email", None)})
