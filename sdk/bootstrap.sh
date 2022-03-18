#!/bin/bash
set -e

LINK_FOLDER="--link-folder `pwd`/../.yarn"

yarn install --frozen-lockfile
yarn link $LINK_FOLDER @aztec/barretenberg
yarn link $LINK_FOLDER @aztec/blockchain
yarn build
cd dest && yarn link $LINK_FOLDER