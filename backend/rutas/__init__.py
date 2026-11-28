# -*- coding: utf-8 -*-
"""Registro modular de Blueprints de la API REST de Capitalia."""

from .auth_bp import auth_bp
from .cartera_bp import cartera_bp
from .importar_bp import importar_bp
from .panel_bp import panel_bp


def registrar_blueprints(app):
    """Registra todos los Blueprints de API sobre la aplicación Flask."""
    app.register_blueprint(auth_bp)
    app.register_blueprint(panel_bp)
    app.register_blueprint(importar_bp)
    app.register_blueprint(cartera_bp)
