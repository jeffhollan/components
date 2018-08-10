const msRestAzure = require('ms-rest-azure')
const { ResourceManagementClient } = require('azure-arm-resource')

async function createRg(
  { name, subscriptionId, tenant, clientId, clientSecret, location },
  context
) {
  const credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenant, clientSecret)
  const resourceClient = new ResourceManagementClient(credentials, subscriptionId)

  const groupParameters = { location: location, tags: { source: 'serverless-framework' } }

  context.log(`Creating resource group: ${name}`)
  await resourceClient.resourceGroups.createOrUpdate(name, groupParameters)

  return {
    name
  }
}

async function deploy(inputs, context) {
  let outputs = await createRg(inputs, context)

  context.saveState({ ...outputs })
  return outputs
}

function remove(inputs, context) {
  context.log('removing resource group')
}

module.exports = {
  deploy,
  remove
}
