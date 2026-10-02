FROM nginx:alpine

# Copy static files
COPY index.html /usr/share/nginx/html/
COPY css/styles.css /usr/share/nginx/html/css/
COPY js/app.js /usr/share/nginx/html/js/
COPY fonts/ /usr/share/nginx/html/fonts/

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80