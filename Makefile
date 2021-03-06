# ---------------------------
# Generated by rel-engage

# This task tells make how to 'build' n-gage. It npm installs n-gage, and
# Once that's done it overwrites the file with its own contents - this
# ensures the timestamp on the file is recent, so make won't think the file
# is out of date and try to rebuild it every time
node_modules/@financial-times/rel-engage/index.mk:
	@echo "Updating rel-engage"
	@npm install --save-dev @financial-times/rel-engage
	@touch $@

# If, by the end of parsing your `Makefile`, `make` finds that any files
# referenced with `-include` don't exist or are out of date, it will run any
# tasks it finds that match the missing file. So if n-gage *is* installed
# it will just be included; if not, it will look for a task to run
-include node_modules/@financial-times/rel-engage/index.mk

verify:

install:

# End generated by rel-engage
# ---------------------------

PROJECT_NAME=biz-ops-runbook-md
PRODUCT_NAME=biz-ops

test:
ifneq ($(CI),)
	jest
else
	jest --watchAll
endif

serverless-offline:
	serverless offline --stage test start

deploy: build-statics move-asset-manifest upload-statics deploy-aws

package:
	serverless package

upload-statics:
	aws s3 sync \
	--cache-control=public,max-age=31536000,immutable \
	--exclude "*.json" \
	./dist/browser s3://biz-ops-statics.${AWS_ACCOUNT_ID}/biz-ops-runbook-md

deploy-aws:
	serverless deploy --stage ${ENVIRONMENT} --verbose

clean:
	rm -rf dist/

transpile:
	@if [ -z $(CI) ]; \
		then serverless webpack; \
		else serverless webpack --mode production; \
	fi

build-production-assets:
	webpack --config webpack.browser.config.js --mode production;

build-statics:
	@if [ -z $(CI) ]; \
		then webpack-dev-server --config webpack.browser.config.js --mode development; \
		else make build-production-assets; \
	fi

run-local-stream-container:
	# if there is no localstreams container running,
	# first check if an exited container blocks (and remove it)
	# then run the container with the kinesalite kinesis emulator
	# see https://docs.docker.com/engine/reference/commandline/ps/
	@if [ -z "$(shell docker ps -q -f name=^/localstreams$)" ]; then \
		if [ "$(shell docker ps -aq -f status=exited -f name=^/localstreams$)" ]; then \
			docker rm localstreams --force; \
		fi; \
		docker run -d --name localstreams -p 4567:4567 instructure/kinesalite; \
		make emulate-local-kinesis-stream; \
	fi;

emulate-local-kinesis-stream:
	@if [ -z "$(shell aws --region eu-west-1 --no-verify-ssl \
	--endpoint-url=http://localhost:4567 kinesis list-streams \
	| grep change-request-api-test-enriched-stream)" ]; then \
		aws --region eu-west-1 --no-verify-ssl --endpoint-url=http://localhost:4567 kinesis \
		create-stream --stream-name change-request-api-test-enriched-stream --shard-count 1; \
	fi

run-local-message-stream: run-local-stream-container

delete-local-stream:
	aws kinesis delete-stream --region eu-west-1 --stream-name change-request-api-test-enriched-stream

send-message-to-local-stream:
	aws kinesis --endpoint-url http://localhost:4567 \
	put-record --stream-name change-request-api-test-enriched-stream \
	--partition-key “MyFirstMessage” \
	--data "{\"githubData\":{\"htmlUrl\":\"https://github.com/Financial-Times/runbook.md/pull/182\"},\"user\":{\"githubName\":\"doramatadora\"},\"systemCode\":\"biz-ops-runbook-md\",\"commit\":\"5083b1a7ef1f110e6e796808f069a5ae2d7474a8\",\"loggerContext\":{\"traceId\":\"HASH_HERE\"},\"isProdEnv\":true}"

run: clean run-local-message-stream run-web

run-web:
	@concurrently "make build-statics" "make serverless-offline"

move-asset-manifest:
	[ -f "./dist/browser/manifest.json" ] && mv "./dist/browser/manifest.json" ./lambdas/ingester/src/assets/

create-database:
	aws cloudformation create-stack \
	--region eu-west-1 \
	--stack-name biz-ops-runbook-md-data \
	--template-body file://$$(pwd)/cloudformation/dynamodb.yaml \
	--tags Key=description,Value="Data store for pull request evaluations of runbook.md files in repos" \
	Key=systemCode,Value=biz-ops-runbook-md \
	Key=environment,Value=$$ENVIRONMENT_TAG \
	Key=teamDL,Value=reliability.engineering@ft.com
