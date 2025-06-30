FROM node:18
WORKDIR /opt/node_app
COPY . .
# do not ignore optional dependencies:
# Error: Cannot find module @rollup/rollup-linux-x64-gnu
RUN yarn --network-timeout 600000
ARG NODE_ENV=production
RUN yarn build:app:docker

# Install serve package globally
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Serve the built app
CMD ["serve", "-s", "excalidraw-app/build", "-p", "3000"]