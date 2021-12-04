import { columbus5, AddressProviderFromJson, MARKET_DENOMS, Earn } from "@anchor-protocol/anchor.js";
import { LCDClient, Dec } from "@terra-money/terra.js";
import "dotenv/config";
import fetch from 'node-fetch';

interface EpochStateResponse {
  exchange_rate: string;
  aterra_supply: string;
}
// https://lcd.terra.dev/swagger-ui/#/
const myAddress = process.env.TERRA_ADDR;
if (!myAddress) throw new Error(`Undefined .env value: 'TERRA_ADDR'`)
const depositTx = process.env.TERRA_DEPOSIT_TX;
if (!depositTx) throw new Error(`Undefined .env value: 'TERRA_DEPOSIT_TX'`)
const market = "uusd";
const addressProvider = new AddressProviderFromJson(columbus5);
const lcd = new LCDClient({ URL: 'https://lcd.terra.dev', chainID: 'columbus-5' });
//@ts-ignore
const marketContractAddress = addressProvider.market(market);
//@ts-ignore
const tokenAddress = addressProvider.aTerra(market);
console.log(`Checking address : ${process.env.TERRA_ADDR}`);

(async () => {
  const { exchange_rate, aterra_supply }: EpochStateResponse = await lcd.wasm.contractQuery(
    marketContractAddress,
    {
      epoch_state: {
        block_height: undefined,
      },
    },
  );
  let depositedBalance = await lcd.tx.txInfo(depositTx).then((res) => {
    return res && res.logs && new Dec(res.logs[0].events.filter(e => e.type === 'wasm')[0].attributes.filter(a => a.key === 'deposit_amount')[0].value).div(1000000).toFixed(2) || null;
  }, (err: any) => { console.log(err) });
  let depositedBalanceMessage;
  if(depositedBalance) {
    depositedBalanceMessage = `Initial balance: ${depositedBalance} UST`;
    console.log(depositedBalanceMessage);
  }

  const { balance } = await lcd.wasm.contractQuery(tokenAddress, { balance: { address: myAddress } });
  const deposit = 
    new Dec(exchange_rate).mul(balance)
    .div(1000000)
    .toFixed(2)
    .toString();
  const balanceMessage = `Current balance: ${deposit} UST`;
  console.log(balanceMessage);

  let totalYieldMessage = undefined;
  if(depositedBalance) {
    totalYieldMessage = `Total yield: ${(new Dec(deposit).sub(depositedBalance)).toFixed(2)} UST`;
  }

  console.log(totalYieldMessage)

  const apy = await new Earn(lcd, new AddressProviderFromJson(columbus5)).getAPY({market: MARKET_DENOMS.UUSD});
  const APYMessage = `Current APY: ${(apy * 100).toFixed(2)}%`;
  console.info(APYMessage);

  const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
  const TG_CHAT_ID = process.env.TG_CHAT_ID;

  if(TG_BOT_TOKEN && TG_CHAT_ID) {
    await fetch(`https://api.telegram.org/${TG_BOT_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&parse_mode=html&text=${encodeURIComponent(`${depositedBalanceMessage? depositedBalanceMessage + '\n' : ''}${balanceMessage}\n${totalYieldMessage? totalYieldMessage + '\n' : ''}${APYMessage}`)}`)
  }
})();
