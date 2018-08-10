const msRestAzure = require('ms-rest-azure')
const { ResourceManagementClient } = require('azure-arm-resource')
const sleep = require('util').promisify(setTimeout)

async function createCosmosDb(
  { name, subscriptionId, tenant, clientId, clientSecret, location, resourceGroup, apiType },
  context
) {
  const credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenant, clientSecret)
  const resourceClient = new ResourceManagementClient(credentials, subscriptionId)

  const rgComponent = await context.load('azure-rg', 'resourceGroup', {
    resourceGroup,
    subscriptionId,
    tenant,
    clientId,
    clientSecret,
    location
  })

  await rgComponent.deploy()

  const cosmosParameters = {
    location,
    kind: 'GlobalDocumentDB',
    properties: {
      databaseAccountOfferType: 'Standard',
      capabilities: [
        {
          name: apiType == 'SQL' ? '' : '' // https://github.com/Azure/azure-quickstart-templates/blob/ea219985c5c6e5db220319076781167a2550e186/101-cosmosdb-create-arm-template/azuredeploy.json#L58
        }
      ]
    },
    tags: {
      defaultExperience: 'DocumentDB' // https://github.com/Azure/azure-quickstart-templates/blob/ea219985c5c6e5db220319076781167a2550e186/101-cosmosdb-create-arm-template/azuredeploy.json#L63
    }
  }

  context.log(`Creating CosmosDB account: ${name}`)
  const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.DocumentDB/databaseAccounts/${name}`
  const apiVersion = '2015-04-08'

  let options = {
    method: 'PUT',
    url: `https://management.azure.com${resourceId}?api-version=${apiVersion}`,
    body: cosmosParameters
  }

  await resourceClient.sendRequest(options)

  let db = await resourceClient.resources.getById(resourceId, apiVersion)
  while (db.properties.provisioningState == 'Initializing') {
    context.log('Initializing...')
    await sleep(10000)
    db = await resourceClient.resources.getById(resourceId, apiVersion)
  }

  options = {
    method: 'POST',
    url: `https://management.azure.com${resourceId}/listKeys?api-version=${apiVersion}`,
    body: null
  }

  const keyResponse = await resourceClient.sendRequest(options)

  return {
    name,
    ...keyResponse
  }
}

async function deploy(inputs, context) {
  let outputs = await createCosmosDb(inputs, context)

  context.saveState({ ...outputs })
  return outputs
}

function remove(inputs, context) {
  context.log('removing CosmosDb')
}

module.exports = {
  deploy,
  remove
}
