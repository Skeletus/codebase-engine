//! Application-owned parent-protocol fault fixture; not shipped.
use std::io::{Read, Write};
fn main() {
    let mode = std::env::current_exe().unwrap().file_stem().unwrap().to_string_lossy().into_owned();
    if mode == "startup" { std::thread::sleep(std::time::Duration::from_secs(10)); return; }
    if mode == "wrong-abi" { println!("{{\"version\":1,\"ready\":true,\"abi\":14}}"); return; }
    println!("{{\"version\":1,\"ready\":true,\"abi\":15}}"); std::io::stdout().flush().unwrap();
    let mut input = [0u8;4]; std::io::stdin().read_exact(&mut input).unwrap();
    match mode.as_str() {
        "exit-during-frame" => return,
        "output-below" | "output-at" => {
            let limit = if mode == "output-at" {8388608} else {8388607};
            let prefix=b"{\"version\":1,\"result\":{\"padding\":\"";let suffix=b"\"}}\n";
            let mut output=Vec::from(prefix);output.extend(vec![b'x';limit-prefix.len()-suffix.len()]);output.extend(suffix);
            std::io::stdout().write_all(&output).unwrap();std::io::stdout().flush().unwrap();
        }
        "diagnostics-below" | "diagnostics-at" => {
            std::io::stderr().write_all(&vec![b'x';if mode=="diagnostics-at"{65536}else{65535}]).unwrap();std::io::stderr().flush().unwrap();
            println!("{{\"version\":1,\"result\":{{\"behavior\":{{\"declarations\":[],\"relations\":[],\"gaps\":[],\"handlers\":[]}},\"imports\":[],\"exports\":[],\"importedCalls\":[],\"decorated\":[],\"inheritance\":[],\"all\":null,\"visited\":0}}}}");std::io::stdout().flush().unwrap();
        }
        "output" => { std::io::stdout().write_all(&vec![b'x';8388609]).unwrap(); std::io::stdout().flush().unwrap(); }
        "diagnostics" => { std::io::stderr().write_all(&vec![b'x';65537]).unwrap(); std::io::stderr().flush().unwrap(); }
        "parse-timeout" => std::thread::sleep(std::time::Duration::from_secs(10)),
        "invalid-result" => println!("{{\"version\":1,\"result\":{{\"tree\":{{\"type\":\"module\"}}}}}}"),
        _ => panic!("Unknown controlled fault"),
    }
    std::thread::sleep(std::time::Duration::from_secs(10));
}
