from functools import wraps
from flask import session, redirect, url_for, request

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user" not in session:
            # Save the original page user wanted to access
            next_url = request.url
            return redirect(url_for("auth.login", next=next_url))
        return f(*args, **kwargs)
    return decorated_function
