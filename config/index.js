import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join((process.cwd(), '.env')) })

export default {
    sensitivity_key: process.env.SENSITIVITY_API_KEY,
    openapi_key: process.env.OPENAI_API_KEY,

}