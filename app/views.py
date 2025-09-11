from flask import Blueprint, render_template, session, redirect, url_for
from app.utils import login_required

views_bp = Blueprint("views", __name__)


@views_bp.route("/")
def home():
    # 🔐 If user is not logged in → redirect to Auth0 login
    if "user" not in session:
        return redirect(url_for("auth.login"))  # Assuming auth.login handles Auth0 login

    # Pass user data to the template
    return render_template("index.html", user=session["user"])


@views_bp.route("/profile")
@login_required
def profile():
    # 🔐 If user is not logged in → redirect to Auth0 login
    if "user" not in session:
        return redirect(url_for("auth.login"))  # Assuming auth.login handles Auth0 login

    # Pass user data to the template
    return render_template("profile.html", user=session["user"])


