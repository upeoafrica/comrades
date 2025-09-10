from flask import Blueprint, render_template
from app.utils import login_required

views_bp = Blueprint("views", __name__)


@views_bp.route("/")
@login_required
def home():
    return render_template("index.html")
