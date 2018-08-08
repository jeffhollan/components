module.exports = async function(context, req) {
  context.log(`JavaScript function triggered`)

  context.res = {
    status: 200,
    body: req.body
  }
}
