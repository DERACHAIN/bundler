
#!/opt/homebrew/bin/bash

set -e
RED='\033[0;31m'
NC='\033[0m'
GREEN='\033[0;32m'
CONFIG_FILE=$1
CURRENT_CONTEXT=$(kubectl config current-context)
CURRENT_PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
CLUSTER_NAME=$(echo "$CURRENT_CONTEXT" | awk -F '_' '{print $NF}')
TRIMMED_CLUSTER_NAME=$(echo "$CLUSTER_NAME" | cut -c 1-8)


echo "Current cluster name is: $CLUSTER_NAME"
echo "Current trimmed cluster name is: $TRIMMED_CLUSTER_NAME"



echo "${GREEN} This script must be run only once for a new bundler deployment in the namespace ${NC}"


# Check if the required arguments are passed
# Example:  sh install-release-cloud.sh configs/testing.cfg
if [ "$#" -ne 1 ]; then
    echo " ${RED} Usage: $0 <CONFIG FILE RELATIVE PATH> for deployment ${NC}"
    exit 1
fi


DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ ! -f "$DIR/$CONFIG_FILE" ]; then
    echo "Error: Configuration file "$DIR/$CONFIG_FILE" not found. Choose from configs present in configs"
    exit 1
fi

if [ ! -r "$DIR/$CONFIG_FILE" ]; then
    echo "${RED} Error: Configuration file "$DIR/$CONFIG_FILE" not readable. ${NC}"
    exit 1
fi

# Load the configuration variables
source "$DIR/$CONFIG_FILE"




if [[ ! "$ENV" =~ ^(test|prod)$ ]]; then
    echo "${RED} Error: Invalid ENV value. Allowed values are prod, test. ${NC}"
    exit 1
fi


# Check if the current context matches the one you're looking for
if [[ "$CURRENT_CONTEXT" == "$CONTEXT" ]]; then
  echo "Context matches. Continuing..."
  # Add your script logic here that should run when contexts match
else
  echo "Context does not match. Exiting..."
  exit 1
fi

# Fetch the current project ID from gcloud

# Check if the project IDs match
if [[ "$CURRENT_PROJECT_ID" != "$PROJECT_ID" ]]; then
    echo "${RED} Error: Expected Project ID: $PROJECT_ID, but got: $CURRENT_PROJECT_ID ${NC}"
    exit 1
fi

# Check if IP exists
IP_EXISTS=$(gcloud compute addresses list --filter="name=$IP_NAME" --global --format="get(name)")

# If IP doesn't exist, create a new one
if [ -z "$IP_EXISTS" ]; then
    echo "${RED} Error: Global IP with name $IP_NAME doesn't exist. Please create a Global IP from GCP console ${NC}"
    exit 1 
else
    echo "Global IP with name $IP_NAME already exists."
fi

# Fetch and print the actual IP address
ACTUAL_IP=$(gcloud compute addresses describe $IP_NAME --global --format="get(address)")
echo "${GREEN} The IP address for $IP_NAME is: $ACTUAL_IP ${NC}"

echo "${GREEN} Make sure you have added an A record against ${DNS_NAME} with ${ACTUAL_IP} ${NC}"


if ! kubectl get namespace $NAMESPACE; then
  echo "${RED} Error: $NAMESPACE doesnt exists, Please create the namespace ${NC}"
  exit 1 ;
else
  echo "${GREEN} SUCCESS: $NAMESPACE exists ${NC}"
fi


source "setup-scripts/create-variables.sh" "$DIR/$CONFIG_FILE"


##This will create a configMap from the config.json.enc and that will be mounted on 
## all the pods in a namespace. The assumption is that a single namespace will only
## have two deployments paymaster and bundler thats why 
# for bundler the configMap name will be bundler-common-configMap


bash setup-scripts/create-encrypted-config-secret.sh "$ENCRYPTED_CONFIG_SECRET"
bash setup-scripts/create-secret.sh "$SECRET_NAME"
bash setup-scripts/create-gcp-role.sh "$PROJECT_ID" "$GCP_IAM_ROLE" "$ENCRYPTED_CONFIG_SECRET" "$SECRET_NAME"
bash setup-scripts/gcp-role-binding.sh "$NAMESPACE" "$PROJECT_ID" "$GCP_IAM_ROLE" "$KUBE_SERVICE_ACCOUNT"

REDIS_MASTER_REPLICA=1
REDIS_READ_REPLICA=2
sh install-redis/install.sh $ENV $NAMESPACE $REDIS_MASTER_REPLICA $REDIS_READ_REPLICA

RABBITMQ_REPLICA_COUNT=3
sh install-rabbitmq/install.sh $ENV $NAMESPACE $RABBITMQ_REPLICA_COUNT

sh install-mongo/install.sh $ENV $NAMESPACE

CENTRIFUGO_REPLICA_COUNT=3
sh install-centrifugo/install.sh $ENV $NAMESPACE $CENTRIFUGO_REPLICA_COUNT

# sh install-prometheus/install.sh
# bash install-prometheus-adapter/install.sh $ENV $NAMESPACE "$CHAINS_CFG_FILENAME"
echo "$CHAINS_CFG_FILENAME"
bash network/install.sh $ENV $NAMESPACE $DNS_NAME "$IP_NAME" "$CHAINS_CFG_FILENAME"

# sh install-grafana/install.sh $ENV $NAMESPACE
